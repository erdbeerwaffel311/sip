export interface MemberAccount {
  name: string;
  username: string;
  password?: string;
}

export interface AppSettings {
  clubName: string;
  adminPassword: string;
  adminEmail?: string;
  allowedMembers: string[];
  memberAccounts: MemberAccount[];
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export const DEFAULT_ALLOWED_MEMBERS: string[] = [
  'Aaron Hammerer',
  'Amina Amann',
  'Angelina Fitsch',
  'Anton Loss',
  'Celil-Kaan Beler',
  'Chiara Forcher',
  'Elias Mantler',
  'Elias Mathis',
  'Elisabeth Himmer',
  'Emil Schmalfuss',
  'Emma Holzer',
  'Fabian Stauss',
  'Hannah Grabher',
  'Ian Hörburger',
  'Ismail Öztoprak',
  'Jeramis Dengel',
  'Josefine Müller',
  'Juliana Moosbrugger',
  'Kaspar Riedmann',
  'Katharina Nigg',
  'Leon Schwendinger',
  'Liljana Walser',
  'Marian Kolanovic',
  'Nick Klein',
  'Paulus Cukrowicz',
  'Rania Moosbrugger',
  'Simon Märker',
  'Sophia-Maria Thoma',
];

export const DEFAULT_SIP_SETTINGS: AppSettings = {
  clubName: 'Schüler:innenparlament (SiP)',
  adminPassword: 'admin',
  adminEmail: '',
  allowedMembers: DEFAULT_ALLOWED_MEMBERS,
  memberAccounts: DEFAULT_ALLOWED_MEMBERS.map((name) => ({
    name,
    username: name.toLowerCase().replace(/\s+/g, '.') + '@schuelerunion.at',
  })),
  supabaseUrl: 'https://zdduvvluqairhnbdbunk.supabase.co',
  supabaseAnonKey: 'sb_publishable_CEjKQudAlYxYtTvykEwDxw_E4KvyUhC',
};
