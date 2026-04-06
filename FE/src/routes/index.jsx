import Home from '../pages/Home';
import DetailProduct from '../pages/DetailProduct';
import Login from '../pages/Login';
import RegisterUser from '../pages/RegisterUser';
import Admin from '../pages/DashbroadComponents/index';
import InfoUser from '../pages/InfoUser';
import ForgotPassword from '../pages/ForgotPassword';
import Categories from '../pages/Categories';
import Rules from '../pages/Rules';
import Contact from '../pages/Contact';
import AdminRoute from '../components/AdminRoute';
export const routes = [
    {
        path: '/',
        component: <Home />,
    },
    {
        path: '/product/:id',
        component: <DetailProduct />,
    },
    {
        path: '/login',
        component: <Login />,
    },
    {
        path: '/register',
        component: <RegisterUser />,
    },
    {
        path: '/admin',
        component: (
            <AdminRoute>
                <Admin />
            </AdminRoute>
        ),
    },
    {
        path: '/infoUser',
        component: <InfoUser />,
    },
    {
        path: '/forgot-password',
        component: <ForgotPassword />,
    },
    {
        path: '/categories',
        component: <Categories />,
    },
    {
        path: '/rules',
        component: <Rules />,
    },
    {
        path: '/contact',
        component: <Contact />,
    },
];
