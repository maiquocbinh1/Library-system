import { useEffect } from 'react';
import CardBody from './components/Cardbody';
import Footer from './components/Footer';
import Header from './components/Header';
import { requestGetAllProduct } from './config/request';
import { useState } from 'react';

/** MySQL: `id`; Mongo: `mysqlId` / `_id` */
function normalizeProduct(p) {
    if (!p || typeof p !== 'object') return p;
    const id = p.id ?? p.mysqlId ?? (p._id != null ? String(p._id) : undefined);
    return id != null ? { ...p, id } : p;
}

function App() {
    const [dataProduct, setDataProduct] = useState([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await requestGetAllProduct();
                const raw = res?.metadata;
                const list = Array.isArray(raw) ? raw : [];
                setDataProduct(list.map(normalizeProduct));
            } catch {
                setDataProduct([]);
            }
        };
        fetchData();
    }, []);

    return (
        <div>
            <header>
                <Header />
            </header>

            <main className="grid grid-cols-4 md:grid-cols-2 lg:grid-cols-5 gap-4 w-[90%] mx-auto mt-5">
                {dataProduct.map((item) => (
                    <CardBody key={item.id ?? item.mysqlId ?? item._id} data={item} />
                ))}
            </main>

            <footer>
                <Footer />
            </footer>
        </div>
    );
}

export default App;
