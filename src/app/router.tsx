import { createBrowserRouter } from 'react-router-dom';
import { SiteLayout } from '../components/layout/SiteLayout';
import { ProtectedRoute } from '../features/auth/ProtectedRoute';
import { HomePage, MarketplacePage, ProductPage, ShopsPage, ShopPage, CategoryPage, PricingPage, LegalPage, ContactPage, NotFoundPage, PaymentReturnPage } from '../pages/public/PublicPages';
import { AuthPage } from '../pages/auth/AuthPage';
import { DashboardPage } from '../pages/client/DashboardPage';
import { MerchantProductsPage } from '../pages/merchant/MerchantProductsPage';
import { CourierDeliveriesPage } from '../pages/courier/CourierDeliveriesPage';
import { AdminPaymentsPage } from '../pages/admin/AdminPaymentsPage';
import { AdminOperationsPage } from '../pages/admin/AdminOperationsPage';

export const router = createBrowserRouter([
  {
    path: '/', element: <SiteLayout />, children: [
      { index: true, element: <HomePage /> },
      { path: 'marketplace', element: <MarketplacePage /> },
      { path: 'products/:id', element: <ProductPage /> },
      { path: 'shops', element: <ShopsPage /> },
      { path: 'shops/:id', element: <ShopPage /> },
      { path: 'categories/:slug', element: <CategoryPage /> },
      { path: 'pricing', element: <PricingPage /> },
      { path: 'login', element: <AuthPage mode="login" /> },
      { path: 'signup', element: <AuthPage mode="signup" /> },
      { path: 'forgot-password', element: <AuthPage mode="forgot" /> },
      { path: 'reset-password', element: <AuthPage mode="reset" /> },
      { path: 'contact', element: <ContactPage /> },
      { path: 'terms', element: <LegalPage kind="terms" /> },
      { path: 'privacy', element: <LegalPage kind="privacy" /> },
      { path: 'account/confirm', element: <AuthPage mode="confirm" /> },
      { path: 'payment/return', element: <PaymentReturnPage /> },
      { path: 'client', element: <ProtectedRoute allowedRoles={['client']} />, children: [
        { index: true, element: <DashboardPage role="client" /> }, { path: 'dashboard', element: <DashboardPage role="client" /> }, { path: ':section', element: <DashboardPage role="client" /> },
      ]},
      { path: 'merchant', element: <ProtectedRoute allowedRoles={['merchant']} />, children: [
        { index: true, element: <DashboardPage role="merchant" /> }, { path: 'dashboard', element: <DashboardPage role="merchant" /> }, { path: 'products', element: <MerchantProductsPage /> }, { path: ':section', element: <DashboardPage role="merchant" /> },
      ]},
      { path: 'courier', element: <ProtectedRoute allowedRoles={['courier']} />, children: [
        { index: true, element: <DashboardPage role="courier" /> }, { path: 'dashboard', element: <DashboardPage role="courier" /> }, { path: 'deliveries', element: <CourierDeliveriesPage /> }, { path: ':section', element: <DashboardPage role="courier" /> },
      ]},
      { path: 'admin', element: <ProtectedRoute allowedRoles={['admin']} />, children: [
        { index: true, element: <DashboardPage role="admin" /> }, { path: 'dashboard', element: <DashboardPage role="admin" /> }, { path: 'payments', element: <AdminPaymentsPage /> }, { path: ':section', element: <AdminOperationsPage /> },
      ]},
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
