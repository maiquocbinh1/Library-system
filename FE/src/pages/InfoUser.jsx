import React, { useState, useEffect } from 'react';
import { Alert, Layout } from 'antd';
import Sidebar from './InfoUserComponents/Sidebar';
import PersonalInfo from './InfoUserComponents/PersonalInfo';
import BorrowingHistory from './InfoUserComponents/BorrowingHistory';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { useSearchParams } from 'react-router-dom';
import { requestMyUnpaidFines } from '../config/request';

const { Sider, Content } = Layout;

function InfoUser() {
    const [searchParams, setSearchParams] = useSearchParams();
    const validTabs = ['info', 'history'];
    const tabFromUrl = searchParams.get('tab');
    const currentTab = validTabs.includes(tabFromUrl) ? tabFromUrl : 'info';
    const [activeComponent, setActiveComponent] = useState(currentTab);
    const [unpaidFineSummary, setUnpaidFineSummary] = useState(null);

    useEffect(() => {
        setActiveComponent(currentTab);
    }, [currentTab]);

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
            case 'info':
                return <PersonalInfo />;
            case 'history':
                return <BorrowingHistory />;
            default:
                return <PersonalInfo />;
        }
    };

    return (
        <Layout style={{ minHeight: '100vh' }}>
            <header>
                <Header />
            </header>
            <Layout style={{ width: '90%', margin: '20px auto', paddingTop: '64px' }}>
                <Sider width={250} theme="light" className="border-r border-gray-200">
                    <Sidebar activeComponent={activeComponent} setActiveComponent={handleChangeComponent} />
                </Sider>
                <Content style={{ paddingLeft: '20px', margin: 0 }}>
                    <div className="bg-white p-6 rounded-lg shadow-md min-h-full">
                        {unpaidFineSummary && (
                            <Alert
                                type="error"
                                showIcon
                                className="mb-4 rounded-lg border-red-200 bg-red-50"
                                message="Bạn có khoản phạt chưa nộp"
                                description={
                                    <>
                                        Bạn còn <strong>{unpaidFineSummary.unpaidCount}</strong> phiếu phạt chưa thanh toán (tổng{' '}
                                        <strong>{Number(unpaidFineSummary.totalUnpaidAmount || 0).toLocaleString('vi-VN')} VNĐ</strong>
                                        ). Vui lòng đến thư viện PTIT để nộp tiền theo quy định.
                                    </>
                                }
                            />
                        )}
                        {renderComponent()}
                    </div>
                </Content>
            </Layout>
            <footer>
                <Footer />
            </footer>
        </Layout>
    );
}

export default InfoUser;
