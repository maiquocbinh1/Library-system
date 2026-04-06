import { Navigate } from 'react-router-dom';
import cookies from 'js-cookie';
import { useStore } from '../hooks/useStore';

function AdminRoute({ children }) {
    const { dataUser } = useStore();
    const hasSession = Boolean(cookies.get('logged'));
    const isAdmin = String(dataUser?.role || '').toLowerCase() === 'admin';

    if (hasSession && !dataUser?.id) {
        return <div className="pt-24 text-center text-gray-500">Đang xác thực tài khoản...</div>;
    }

    if (!hasSession || !dataUser?.id || !isAdmin) {
        return <Navigate to="/" replace />;
    }

    return children;
}

export default AdminRoute;
