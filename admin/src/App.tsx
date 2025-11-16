import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { Router } from './router';
import { useSetupStore } from './store/setupStore';

function App() {
  const { checkSetupStatus } = useSetupStore();

  // 应用初始化时检查设置状态
  useEffect(() => {
    checkSetupStatus();
  }, [checkSetupStatus]);

  return (
    <BrowserRouter basename="/admin">
      <Router />
    </BrowserRouter>
  );
}

export default App;

