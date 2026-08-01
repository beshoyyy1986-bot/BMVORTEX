import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { InviterUserCard } from '@/components/tools/inviter-user-card';

const queryClient = new QueryClient();

function Home() {
  return (
    <div className="min-h-screen w-full bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold text-gray-900">
            BMVORTEX - لوحة التحكم
          </h1>
          <p className="text-gray-600">
            أدوات متقدمة لإدارة حسابات Meta Business Manager
          </p>
        </header>

        <div className="grid gap-6">
          <InviterUserCard />
        </div>
      </div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
