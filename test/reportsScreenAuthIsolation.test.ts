import React from 'react';
import { View } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() })
}));

jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => {
    const ReactMock = require('react');
    const { View: MockView } = require('react-native');
    return ReactMock.createElement(MockView, null, children);
  }
}));
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-document-picker', () => ({}));
jest.mock('expo-file-system/legacy', () => ({}));
jest.mock('expo-image-manipulator', () => ({}));

jest.mock('../src/components/Screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => {
    const ReactMock = require('react');
    const { View: MockView } = require('react-native');
    return ReactMock.createElement(MockView, null, children);
  }
}));

jest.mock('../src/components/Card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => {
    const ReactMock = require('react');
    const { View: MockView } = require('react-native');
    return ReactMock.createElement(MockView, null, children);
  }
}));

const mockContext = {
  wellness: { wellnessScore: 0 },
  onboarding: null,
  checkIns: [],
  themeMode: 'light',
  authSession: null as null | {
    accountId: string;
    sessionId: string;
    sessionExpiresAtISO: string;
    sessionToken: string;
    client: { fiteatsyClientId: string; status: string };
    user: { id: string; name: string; email: string; mobileNumber: string };
  }
};

jest.mock('../src/state/AppContext', () => ({
  useAppContext: () => mockContext
}));

const mockListAnalyzedReports = jest.fn();
const mockListBiomarkerHistory = jest.fn();

jest.mock('../src/services/reportUploadService', () => ({
  listAnalyzedReports: (...args: unknown[]) => mockListAnalyzedReports(...args),
  listBiomarkerHistory: (...args: unknown[]) => mockListBiomarkerHistory(...args),
  uploadAndAnalyzeReport: jest.fn()
}));

jest.mock('../src/services/nuetraService', () => ({
  generateNuetraSummary: jest.fn(async () => 'Personalized summary'),
  generateParameterInsight: jest.fn(async () => 'Personalized insight'),
  generateActionPlan: jest.fn(async () => []),
  generateCrossReferenceInsights: jest.fn(async () => []),
  __esModule: true
}));

const authSession = (id: string) => ({
  accountId: id,
  sessionId: `session-${id}`,
  sessionExpiresAtISO: '2026-08-10T00:00:00.000Z',
  sessionToken: `token-${id}`,
  client: { fiteatsyClientId: `client-${id}`, status: 'active' },
  user: { id, name: `User ${id}`, email: `${id}@example.test`, mobileNumber: `99999999${id}` }
});

describe('ReportsScreen auth isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockContext.authSession = authSession('a');
    mockListAnalyzedReports.mockResolvedValue([
      {
        id: 'report-a',
        status: 'PUBLISHED',
        fileName: 'redcliffe.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        source: 'pdf',
        createdAtISO: '2026-08-01T00:00:00.000Z',
        updatedAtISO: '2026-08-01T00:00:00.000Z',
        analysis: {
          reportDate: '15 Mar 2026',
          labName: 'Redcliffe',
          parameters: [
            {
              name: 'HbA1c',
              value: 5.8,
              unit: '%',
              referenceRange: '4.0-5.6',
              status: 'high',
              category: 'Metabolic'
            }
          ],
          score: 62,
          categoryScores: { Blood: 0, Metabolic: 62, Organs: 0, Thyroid: 0, Vitamins: 0 },
          summary: 'Previous user report',
          actionPlan: []
        }
      }
    ]);
    mockListBiomarkerHistory.mockResolvedValue([]);
  });

  it('clears previous account biomarker data immediately when a fresh signup loads Reports', async () => {
    const { queryByText, getByText, rerender } = render(React.createElement(require('../src/screens/home/ReportsScreen').ReportsScreen));

    await waitFor(() => expect(mockListAnalyzedReports).toHaveBeenCalled());
    await waitFor(() => expect(getByText('HbA1c')).toBeTruthy());
    expect(getByText(/Last report:/)).toBeTruthy();

    mockListAnalyzedReports.mockResolvedValueOnce([]);
    mockListBiomarkerHistory.mockResolvedValueOnce([]);
    mockContext.authSession = authSession('b');

    await act(async () => {
      rerender(React.createElement(require('../src/screens/home/ReportsScreen').ReportsScreen));
    });

    await waitFor(() => expect(getByText('View history (0)')).toBeTruthy());
    expect(queryByText('HbA1c')).toBeNull();
    expect(queryByText(/Last report:/)).toBeNull();
    expect(queryByText('5.8')).toBeNull();
  }, 15_000);
});
