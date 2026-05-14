import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Layout } from 'antd';
import { toast } from 'react-toastify';
import Sidebar from './InfoUserComponents/Sidebar';
import ProfileAccount from './InfoUserComponents/ProfileAccount';
import CurrentBorrows from './InfoUserComponents/CurrentBorrows';
import BorrowingHistory from './InfoUserComponents/BorrowingHistory';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { useSearchParams } from 'react-router-dom';
import { requestGetHistoryUser, requestMyUnpaidFines } from '../config/request';
import { normalizeLoanStatusKey } from '../utils/loanTicketStatus';

const VALID_TABS = ['profile', 'current', 'history'];

function InfoUser() {
    const [searchParams, setSearchParams] = useSearchParams();
    const tabFromUrl = searchParams.get('tab');
    const normalized = tabFromUrl === 'info' ? 'profile' : tabFromUrl;
    const currentTab = VALID_TABS.includes(normalized) ? normalized : 'profile';
    const [activeComponent, setActiveComponent] = useState(currentTab);
    const [unpaidFineSummary, setUnpaidFineSummary] = useState(null);
    const [loans, setLoans] = useState([]);
    const [loansLoading, setLoansLoading] = useState(true);
    /** Map phiếu id → trạng thái lần tải trước (để phát hiện thủ thư vừa duyệt). */
    const loanStatusRef = useRef(null);

    const refreshLoans = useCallback(async () => {
        setLoansLoading(true);
        try {
            const res = await requestGetHistoryUser();
            const list = Array.isArray(res?.metadata) ? res.metadata : [];
            const prev = loanStatusRef.current;
            if (prev && list.length) {
                for (const loan of list) {
                    const id = String(loan.id || loan._id || '').trim();
                    if (!id) continue;
                    const oldKey = normalizeLoanStatusKey(prev[id]);
                    const newKey = normalizeLoanStatusKey(loan.status);
                    if (oldKey === 'PENDING_APPROVAL' && (newKey === 'BORROWING' || newKey === 'OVERDUE')) {
                        toast.info('Vui lòng tới thư viện để nhận sách.');
                        break;
                    }
                }
            }
            const next = {};
            for (const loan of list) {
                const id = String(loan.id || loan._id || '').trim();
                if (id) next[id] = loan.status;
            }
            loanStatusRef.current = Object.keys(next).length ? next : null;
            setLoans(list);
        } catch {
            setLoans([]);
        } finally {
            setLoansLoading(false);
        }
    }, []);

    /** Tải lại phiếu định kỳ để sinh viên thấy thông báo sau khi thủ thư duyệt (không cần F5). */
    useEffect(() => {
        const t = window.setInterval(() => {
            void refreshLoans();
        }, 45000);
        return () => window.clearInterval(t);
    }, [refreshLoans]);

    useEffect(() => {
        setActiveComponent(currentTab);
    }, [currentTab]);

    useEffect(() => {
        refreshLoans();
    }, [refreshLoans]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await requestMyUnpaidFines();
                const meta = res?.metadata ?? res;
                if (!cancelled && meta && Number(meta.unpaidCount) > 0) {
                    setUnpaidFineSummary(meta);
                } else if (!cancelled) {
                    setUnpaidFineSummary(null);
                }
            } catch {
                if (!cancelled) setUnpaidFineSummary(null);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const handleChangeComponent = (key) => {
        setActiveComponent(key);
        setSearchParams({ tab: key });
    };

    const renderComponent = () => {
        switch (activeComponent) {
            case 'profile':
                return (
                    <ProfileAccount
                        loans={loans}
                        loansLoading={loansLoading}
                        unpaidFineSummary={unpaidFineSummary}
                    />
                );
            case 'current':
                return <CurrentBorrows loans={loans} loading={loansLoading} onRefresh={refreshLoans} />;
            case 'history':
                return <BorrowingHistory loans={loans} loading={loansLoading} onRefresh={refreshLoans} />;
            default:
                return (
                    <ProfileAccount
                        loans={loans}
                        loansLoading={loansLoading}
                        unpaidFineSummary={unpaidFineSummary}
                    />
                );
        }
    };

    return (
        <Layout style={{ minHeight: '100vh', background: '#f4f6fb' }}>
            <header>
                <Header />
            </header>
            <div
                className="mx-auto flex w-[94%] max-w-[1200px] flex-col gap-5 pb-8 pt-[88px] lg:flex-row lg:items-start"
            >
                <aside className="w-full shrink-0 rounded-2xl border border-slate-200/80 bg-white shadow-sm lg:w-[268px]">
                    <Sidebar activeComponent={activeComponent} setActiveComponent={handleChangeComponent} />
                </aside>
                <main className="min-h-[480px] min-w-0 flex-1">
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm md:p-8">
                        {unpaidFineSummary && (
                            <Alert
                                type="error"
                                showIcon
                                className="mb-6 rounded-xl border-red-200 bg-red-50"
                                message="Bạn có khoản phạt chưa nộp"
                                description={
                                    <>
                                        Bạn còn <strong>{unpaidFineSummary.unpaidCount}</strong> phiếu phạt chưa thanh toán (tổng{' '}
                                        <strong>{Number(unpaidFineSummary.totalUnpaidAmount || 0).toLocaleString('vi-VN')} VNĐ</strong>
                                        ). Vui lòng đến thư viện để nộp tiền theo quy định.
                                    </>
                                }
                            />
                        )}
                        {renderComponent()}
                    </div>
                </main>
            </div>
            <footer>
                <Footer />
            </footer>
        </Layout>
    );
}

export default InfoUser;
