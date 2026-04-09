import { useState } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Subscriptions from './pages/Subscriptions';
// import Customers from './pages/Customers';
import SellingPlans from './pages/SellingPlans';
import CreatePlan from './pages/CreatePlan';
import Checkout from './pages/Checkout';
import ThankYou from "./pages/ThankYou";
import Login from './pages/Login';
import ProtectedRoute from './components/ProtectedRoute';
import AdminSettings from './pages/AdminSettings';

function Layout() {
  const location = useLocation();
  const isCheckout = location.pathname === '/checkout';
  const hideSidebar = location.pathname === '/thank-you' || location.pathname === '/login';

  const [environment, setEnvironment] = useState(
    () => localStorage.getItem('adminEnvironment') || 'sandbox'
  );

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const handleEnvironmentChange = (env) => {
    setEnvironment(env);
    localStorage.setItem('adminEnvironment', env);
  };

  return (
    <div className="flex min-h-screen">
      {!isCheckout && !hideSidebar && (
        <Sidebar environment={environment} setEnvironment={handleEnvironmentChange} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(prev => !prev)} />
      )}

      <main
    className={`flex-1 min-h-screen transition-all duration-300 ease-in-out overflow-x-hidden ${
      isCheckout || hideSidebar
        ? 'p-0 bg-white'
        : `bg-gradient-to-br from-white via-gray-50 to-gray-100 pl-[80px] md:pl-[80px] sm:px-6 ${
            sidebarCollapsed ?  'lg:pl-20' : 'lg:pl-64' 
          }`
    }`}
   >

        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/thank-you" element={<ThankYou />} />
          <Route path="/checkout" element={<Checkout />} />

          {/* Protected admin routes */}
          <Route path="/" element={<ProtectedRoute><Dashboard environment={environment} /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard environment={environment} /></ProtectedRoute>} />
          <Route path="/subscriptions" element={<ProtectedRoute><Subscriptions environment={environment} /></ProtectedRoute>} />
          <Route path="/selling-plans" element={<ProtectedRoute><SellingPlans environment={environment} /></ProtectedRoute>} />
          <Route path="/subscription-plan" element={<ProtectedRoute><CreatePlan /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><AdminSettings /></ProtectedRoute>} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  );
}
