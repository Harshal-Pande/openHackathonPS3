import React from 'react';
import { Button } from '../components/Button.js';
import { navigate } from '../lib/router.js';
import { HelpCircle } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  return (
    <div style={{ textAlign: 'center', padding: 'var(--s-7) var(--s-4)' }}>
      <HelpCircle size={40} className="text-3" style={{ margin: '0 auto var(--s-3)' }} />
      <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: 'var(--s-2)' }}>Page Not Found</h2>
      <p className="text-2" style={{ marginBottom: 'var(--s-4)' }}>
        The requested URL was not recognized by RevertLens.
      </p>
      <Button variant="secondary" onClick={() => navigate('/')}>
        Go to Investigation
      </Button>
    </div>
  );
};
