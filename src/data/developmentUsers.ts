export type DevelopmentUser = {
  id: string;
  shortName: string;
  name: string;
  mobileNumber: string;
  email: string;
  client: {
    fiteatsyClientId: string;
    status: 'active';
  };
};

export const DEVELOPMENT_USERS: DevelopmentUser[] = [
  {
    id: 'dev_user_lalit',
    shortName: 'Lalit',
    name: 'Lalit Paunikar',
    mobileNumber: '9999999991',
    email: 'lalit.dev@fiteatsy.local',
    client: {
      fiteatsyClientId: 'fc_dev_001',
      status: 'active'
    }
  },
  {
    id: 'dev_user_sayali',
    shortName: 'Sayali',
    name: 'Sayali Phansalkar',
    mobileNumber: '9999999992',
    email: 'sayali.dev@fiteatsy.local',
    client: {
      fiteatsyClientId: 'fc_dev_002',
      status: 'active'
    }
  },
  {
    id: 'dev_user_john',
    shortName: 'John',
    name: 'John Smith',
    mobileNumber: '9999999993',
    email: 'john.dev@fiteatsy.local',
    client: {
      fiteatsyClientId: 'fc_dev_003',
      status: 'active'
    }
  },
  {
    id: 'dev_user_priya',
    shortName: 'Priya',
    name: 'Dr Priya Sharma',
    mobileNumber: '9999999994',
    email: 'priya.dev@fiteatsy.local',
    client: {
      fiteatsyClientId: 'fc_dev_004',
      status: 'active'
    }
  }
];
