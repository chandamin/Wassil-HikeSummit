// src/mocks/dashboardMock.js
export const summaryMock = {
    storeHash: 'demo-store',
    installedAt: '2025-01-01T00:00:00.000Z',
    totalSubscribers: 42,
    activeSubscribers: 36,
};

export const subscribersMock = [
    {
        orderId: 10521,
        status: 'active',
        createdAt: '2025-01-10T12:00:00.000Z',
    },
    {
        orderId: 10518,
        status: 'active',
        createdAt: '2025-01-08T09:30:00.000Z',
    },
    {
        orderId: 10511,
        status: 'cancelled',
        createdAt: '2025-01-02T14:45:00.000Z',
    },
];
