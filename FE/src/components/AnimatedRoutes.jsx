import { AnimatePresence, motion } from 'framer-motion';
import { Route, Routes, useLocation } from 'react-router-dom';
import { routes } from '../routes/index.jsx';

const variants = {
    initial: { opacity: 0, y: 10, filter: 'blur(2px)' },
    animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
    exit: { opacity: 0, y: -8, filter: 'blur(2px)' },
};

const transition = {
    type: 'tween',
    ease: [0.22, 1, 0.36, 1],
    duration: 0.22,
};

export default function AnimatedRoutes() {
    const location = useLocation();

    return (
        <AnimatePresence mode="wait" initial={false}>
            <Routes location={location} key={location.pathname}>
                {routes.map((route, index) => (
                    <Route
                        key={index}
                        path={route.path}
                        element={
                            <motion.div variants={variants} initial="initial" animate="animate" exit="exit" transition={transition}>
                                {route.component}
                            </motion.div>
                        }
                    />
                ))}
            </Routes>
        </AnimatePresence>
    );
}

