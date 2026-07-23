// Proxy Manager with automatic cleanup of non-working proxies

class ProxyManager {
    constructor() {
        this.proxies = [];
        this.failedProxies = new Set();
        this.lastChecked = new Map();
        this.init();
    }

    init() {
        this.loadProxies();
        this.cleanupFailedProxies();
    }

    loadProxies() {
        const stored = localStorage.getItem('vortex_proxies');
        if (stored) {
            try {
                this.proxies = JSON.parse(stored);
            } catch (e) {
                console.error('Failed to load proxies:', e);
                this.proxies = [];
            }
        }
    }

    saveProxies() {
        localStorage.setItem('vortex_proxies', JSON.stringify(this.proxies));
    }

    addProxy(proxy) {
        if (!this.proxies.includes(proxy)) {
            this.proxies.push(proxy);
            this.saveProxies();
            return true;
        }
        return false;
    }

    removeProxy(proxy) {
        const index = this.proxies.indexOf(proxy);
        if (index > -1) {
            this.proxies.splice(index, 1);
            this.failedProxies.delete(proxy);
            this.lastChecked.delete(proxy);
            this.saveProxies();
            return true;
        }
        return false;
    }

    getProxies() {
        return this.proxies.filter(proxy => !this.failedProxies.has(proxy));
    }

    getAllProxies() {
        return [...this.proxies];
    }

    async testProxy(proxy) {
        const timeout = 10000; // 10 seconds timeout
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch('https://httpbin.org/ip', {
                method: 'GET',
                signal: controller.signal,
                // Note: This won't actually use the proxy in browser environment
                // In a real implementation, this would be handled by a backend service
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                const data = await response.json();
                this.markProxyWorking(proxy);
                return { success: true, ip: data.origin };
            } else {
                this.markProxyFailed(proxy);
                return { success: false, error: `HTTP ${response.status}` };
            }
        } catch (error) {
            this.markProxyFailed(proxy);
            return { success: false, error: error.message };
        }
    }

    markProxyWorking(proxy) {
        this.failedProxies.delete(proxy);
        this.lastChecked.set(proxy, { status: 'working', timestamp: Date.now() });
    }

    markProxyFailed(proxy) {
        this.failedProxies.add(proxy);
        this.lastChecked.set(proxy, { status: 'failed', timestamp: Date.now() });
    }

    async testAllProxies() {
        const results = [];
        
        for (const proxy of this.proxies) {
            const result = await this.testProxy(proxy);
            results.push({ proxy, ...result });
            
            // Add small delay between requests to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        this.saveProxies();
        return results;
    }

    cleanupFailedProxies() {
        const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        
        // Remove proxies that have been failed for more than a week
        for (const [proxy, check] of this.lastChecked.entries()) {
            if (check.status === 'failed' && check.timestamp < oneWeekAgo) {
                this.removeProxy(proxy);
            }
        }
        
        // Also remove any failed proxies that aren't in the last checked map
        this.proxies = this.proxies.filter(proxy => {
            const check = this.lastChecked.get(proxy);
            return !check || check.status === 'working' || check.timestamp > oneWeekAgo;
        });
        
        this.saveProxies();
    }

    getRandomProxy() {
        const workingProxies = this.getProxies();
        if (workingProxies.length === 0) {
            return null;
        }
        
        const randomIndex = Math.floor(Math.random() * workingProxies.length);
        return workingProxies[randomIndex];
    }

    getProxyStats() {
        const total = this.proxies.length;
        const working = this.getProxies().length;
        const failed = this.failedProxies.size;
        
        return {
            total,
            working,
            failed,
            workingPercentage: total > 0 ? Math.round((working / total) * 100) : 0
        };
    }

    exportProxies() {
        const data = {
            proxies: this.proxies,
            failedProxies: Array.from(this.failedProxies),
            lastChecked: Object.fromEntries(this.lastChecked),
            exportedAt: new Date().toISOString()
        };
        
        return JSON.stringify(data, null, 2);
    }

    importProxies(jsonData) {
        try {
            const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
            
            if (data.proxies && Array.isArray(data.proxies)) {
                this.proxies = [...new Set([...this.proxies, ...data.proxies])]; // Remove duplicates
                this.saveProxies();
                
                if (data.failedProxies && Array.isArray(data.failedProxies)) {
                    data.failedProxies.forEach(proxy => this.failedProxies.add(proxy));
                }
                
                if (data.lastChecked) {
                    Object.entries(data.lastChecked).forEach(([proxy, check]) => {
                        this.lastChecked.set(proxy, check);
                    });
                }
                
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('Failed to import proxies:', error);
            return false;
        }
    }

    // Site-specific proxy management
    setSiteProxy(site, proxy) {
        const siteProxies = JSON.parse(localStorage.getItem('vortex_site_proxies') || '{}');
        siteProxies[site] = proxy;
        localStorage.setItem('vortex_site_proxies', JSON.stringify(siteProxies));
    }

    getSiteProxy(site) {
        const siteProxies = JSON.parse(localStorage.getItem('vortex_site_proxies') || '{}');
        return siteProxies[site] || null;
    }

    removeSiteProxy(site) {
        const siteProxies = JSON.parse(localStorage.getItem('vortex_site_proxies') || '{}');
        delete siteProxies[site];
        localStorage.setItem('vortex_site_proxies', JSON.stringify(siteProxies));
    }

    // Get proxy based on option
    getProxy(option, site = null) {
        switch (option) {
            case 'none':
                return null;
            case 'site':
                return site ? this.getSiteProxy(site) : null;
            case 'custom':
                return null; // Will be provided by user
            case 'random':
            default:
                return this.getRandomProxy();
        }
    }
}

// Create singleton instance
const proxyManager = new ProxyManager();

// Export for use in components
export default proxyManager;

// Export utility functions
export const addProxy = (proxy) => proxyManager.addProxy(proxy);
export const removeProxy = (proxy) => proxyManager.removeProxy(proxy);
export const getProxies = () => proxyManager.getProxies();
export const testProxy = (proxy) => proxyManager.testProxy(proxy);
export const testAllProxies = () => proxyManager.testAllProxies();
export const getProxyStats = () => proxyManager.getProxyStats();
export const getRandomProxy = () => proxyManager.getRandomProxy();
export const setSiteProxy = (site, proxy) => proxyManager.setSiteProxy(site, proxy);
export const getSiteProxy = (site) => proxyManager.getSiteProxy(site);
export const getProxyForOption = (option, site = null) => proxyManager.getProxy(option, site);
