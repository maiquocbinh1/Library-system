import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@ant-design/v5-patch-for-react-19';
import { BrowserRouter as Router } from 'react-router-dom';
import { Provider } from './store/Provider.jsx';
import AnimatedRoutes from './components/AnimatedRoutes.jsx';

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <Provider>
            <Router>
                <AnimatedRoutes />
            </Router>
        </Provider>
    </StrictMode>,
);
