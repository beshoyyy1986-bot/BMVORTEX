// Function to show status message
function showStatus(message, isSuccess = false) {
  const statusElement = document.getElementById('status');
  statusElement.textContent = message;
  statusElement.className = 'status' + (isSuccess ? ' copied' : '');
  
  // Clear status after 3 seconds
  setTimeout(() => {
    statusElement.textContent = '';
    statusElement.className = 'status';
  }, 3000);
}

// Function to copy text to clipboard
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showStatus('Copied to clipboard!', true);
  } catch (err) {
    showStatus('Failed to copy: ' + err.message);
    console.error('Failed to copy: ', err);
  }
}

// Function to get cookies as JSON
async function getCookiesAsJson() {
  try {
    // Get all cookies
    const cookies = await chrome.cookies.getAll({});
    if (!cookies || cookies.length === 0) {
      return '{"message": "No cookies found"}';
    }
    return JSON.stringify(cookies, null, 2);
  } catch (err) {
    console.error('Error getting cookies:', err);
    throw new Error('Failed to get cookies: ' + err.message);
  }
}

// Function to get cookies as string (key=value pairs)
async function getCookiesAsString() {
  try {
    const cookies = await chrome.cookies.getAll({});
    if (!cookies || cookies.length === 0) {
      return 'No cookies found';
    }
    const cookieStrings = cookies.map(cookie => `${cookie.name}=${cookie.value}`);
    return cookieStrings.join('; ');
  } catch (err) {
    console.error('Error getting cookies:', err);
    throw new Error('Failed to get cookies: ' + err.message);
  }
}

// Function to extract token from cookies or localStorage
async function getToken() {
  try {
    // Try to get token from cookies first
    const cookies = await chrome.cookies.getAll({});
    
    // Look for common token names
    const tokenNames = ['token', 'auth_token', 'access_token', 'jwt', 'sessionid', 'csrftoken'];
    
    for (const cookie of cookies) {
      if (tokenNames.some(name => cookie.name.toLowerCase().includes(name))) {
        return cookie.value;
      }
      // Check for JWT tokens (they start with 'ey')
      if (cookie.value.startsWith('ey')) {
        return cookie.value;
      }
    }
    
    // If not found in cookies, return a message
    return 'Token not found in cookies. Try refreshing the page and clicking again.';
  } catch (err) {
    console.error('Error getting token:', err);
    throw new Error('Failed to get token');
  }
}

// Function to get account data for GraphQL API
async function getAccountData() {
  try {
    // Get all relevant data
    const cookies = await chrome.cookies.getAll({});
    
    // Extract potential tokens
    const tokenNames = ['token', 'auth_token', 'access_token', 'jwt', 'sessionid', 'csrftoken'];
    const tokens = {};
    
    for (const cookie of cookies) {
      if (tokenNames.some(name => cookie.name.toLowerCase().includes(name)) || cookie.value.startsWith('ey')) {
        tokens[cookie.name] = cookie.value;
      }
    }
    
    // Get current tab URL for context
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Filter important cookies
    const importantCookies = cookies.filter(cookie => 
      tokenNames.some(name => cookie.name.toLowerCase().includes(name)) || 
      cookie.name.toLowerCase().includes('session') ||
      cookie.name.toLowerCase().includes('auth') ||
      cookie.value.startsWith('ey')
    );
    
    const accountData = {
      url: tab ? tab.url : 'Unknown',
      domain: tab && tab.url ? new URL(tab.url).hostname : 'Unknown',
      tokens: tokens,
      important_cookies: importantCookies,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent
    };
    
    return JSON.stringify(accountData, null, 2);
  } catch (err) {
    console.error('Error getting account data:', err);
    throw new Error('Failed to get account data: ' + err.message);
  }
}

// Event listeners for buttons
document.getElementById('copyCookiesJson').addEventListener('click', async () => {
  try {
    showStatus('Getting cookies...');
    const cookiesJson = await getCookiesAsJson();
    await copyToClipboard(cookiesJson);
  } catch (err) {
    showStatus(err.message);
  }
});

document.getElementById('copyCookiesString').addEventListener('click', async () => {
  try {
    showStatus('Getting cookies...');
    const cookiesString = await getCookiesAsString();
    await copyToClipboard(cookiesString);
  } catch (err) {
    showStatus(err.message);
  }
});

document.getElementById('copyToken').addEventListener('click', async () => {
  try {
    showStatus('Searching for token...');
    const token = await getToken();
    await copyToClipboard(token);
  } catch (err) {
    showStatus(err.message);
  }
});

document.getElementById('copyAccountData').addEventListener('click', async () => {
  try {
    showStatus('Collecting account data...');
    const accountData = await getAccountData();
    await copyToClipboard(accountData);
  } catch (err) {
    showStatus(err.message);
  }
});

// Initialize
showStatus('VORTEX Ready');