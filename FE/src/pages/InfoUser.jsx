import React, { useState } from 'react';
import { Layout } from 'antd';
import Sidebar from './InfoUserComponents/Sidebar';
import PersonalInfo from './InfoUserComponents/PersonalInfo';
import BorrowingHistory from './InfoUserComponents/BorrowingHistory';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { useEffect } from 'react';

const { Sider, Content } = Layout;

function InfoUser() {
    const [activeComponent, setActiveComponent] = useState('info');

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
            <Layout style={{ width: '90%', margin: '20px auto' }}>
                <Sider width={250} theme="light" className="border-r border-gray-200">
                    <Sidebar activeComponent={activeComponent} setActiveComponent={setActiveComponent} />
                </Sider>
                <Content style={{ paddingLeft: '20px', margin: 0 }}>
                    <div className="bg-white p-6 rounded-lg shadow-md min-h-full">{renderComponent()}</div>
                </Content>
            </Layout>
            <footer>
                <Footer />
            </footer>
        </Layout>
    );
}

export default InfoUser;
