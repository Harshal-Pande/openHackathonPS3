import React from 'react';
import { useRouter } from './lib/router.js';
import { Shell } from './components/Shell.js';
import { InvestigatePage } from './pages/InvestigatePage.js';
import { ReportPage } from './pages/ReportPage.js';
import { HistoryPage } from './pages/HistoryPage.js';
import { AboutPage } from './pages/AboutPage.js';
import { OperatorPage } from './pages/OperatorPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';

// Re-export all types from lib/types.js for full backward compatibility
export * from './lib/types.js';

export const App: React.FC = () => {
  const [route] = useRouter();

  const renderContent = () => {
    switch (route.page) {
      case 'investigate':
        return <InvestigatePage />;
      case 'report':
        return <ReportPage id={route.id} />;
      case 'history':
        return <HistoryPage />;
      case 'about':
        return <AboutPage />;
      case 'operator':
        return <OperatorPage />;
      default:
        return <NotFoundPage />;
    }
  };

  return (
    <Shell currentRoute={route} wide={route.page === 'report'}>
      {renderContent()}
    </Shell>
  );
};
