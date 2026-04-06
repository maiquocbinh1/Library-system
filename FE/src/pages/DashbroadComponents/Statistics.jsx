import React, { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic } from 'antd';
import { Column } from '@ant-design/charts';
import { UserOutlined, BookOutlined, SolutionOutlined } from '@ant-design/icons';
import { requestStatistics } from '../../config/request';

const Statistics = () => {
    const [data, setData] = useState({});

    useEffect(() => {
        const fetchData = async () => {
            const res = await requestStatistics();
            const payload = res?.metadata ?? res ?? {};
            setData(payload);
        };
        fetchData();
    }, []);

    const loanStatusData = Array.isArray(data?.loanStatusData) ? data.loanStatusData : [];

    const columnConfig = {
        data: loanStatusData,
        xField: 'status',
        yField: 'count',
        label: {
            position: 'top',
            style: {
                fill: '#595959',
                opacity: 0.9,
            },
        },
        xAxis: {
            label: {
                autoHide: true,
                autoRotate: false,
            },
        },
    };

    return (
        <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-2xl">Thống kê tổng quan</h2>
                <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                    <UserOutlined className="text-blue-600" />
                    <span className="text-sm font-medium text-blue-700">Chào mừng Admin</span>
                </div>
            </div>
            <Row gutter={16} className="mb-6">
                <Col span={8}>
                    <Card>
                        <Statistic title="Tổng số người dùng" value={data?.totalUsers || 0} prefix={<UserOutlined />} />
                    </Card>
                </Col>
                <Col span={8}>
                    <Card>
                        <Statistic title="Tổng số đầu sách" value={data?.totalBooks || 0} prefix={<BookOutlined />} />
                    </Card>
                </Col>
                <Col span={8}>
                    <Card>
                        <Statistic
                            title="Yêu cầu chờ duyệt"
                            value={data?.pendingRequests || 0}
                            prefix={<SolutionOutlined />}
                        />
                    </Card>
                </Col>
            </Row>
            <Row gutter={24}>
                <Col span={24}>
                    <Card title="Tình trạng mượn sách">
                        {loanStatusData.length > 0 ? (
                            <Column {...columnConfig} />
                        ) : (
                            <div className="text-gray-500">Chưa có dữ liệu thống kê</div>
                        )}
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

export default Statistics;
