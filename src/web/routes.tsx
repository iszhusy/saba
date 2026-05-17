import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { App } from '../components/App';
import { LandingPage } from './LandingPage';
import { DnaCanvas } from './DnaCanvas';

function HomePage() {
  const navigate = useNavigate();
  return <LandingPage onEnter={() => navigate('/lab')} />;
}

function LabPage() {
  const navigate = useNavigate();
  return (
    <div className="saba-app">
      <div className="saba-app__canvas" aria-hidden>
        <DnaCanvas densityMultiplier={1.1} alignment={0.82} />
      </div>
      <div className="saba-app__inner">
        <App onExitHome={() => navigate('/')} />
      </div>
    </div>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/lab" element={<LabPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
