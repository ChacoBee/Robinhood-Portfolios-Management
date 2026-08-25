export type TrendPoint = {
  label: string;
  value: string;
  height: number;
};

export type AllocationItem = {
  label: string;
  value: string;
  percentage: number;
  tone: 'gold' | 'sand' | 'green' | 'amber';
};

export type Holding = {
  symbol: string;
  name: string;
  value: string;
  allocation: string;
  move: string;
  direction: 'up' | 'down';
};

export type PreviewPortfolio = {
  totalValue: string;
  dailyValue: string;
  dailyPercent: string;
  asOf: string;
  accounts: number;
  trend: TrendPoint[];
  allocation: AllocationItem[];
  holdings: Holding[];
};

export const previewPortfolio: PreviewPortfolio = {
  totalValue: '$128,640.25',
  dailyValue: '+$1,284.52',
  dailyPercent: '+1.01%',
  asOf: 'Updated 10:14 AM ET · synthetic clock',
  accounts: 3,
  trend: [
    { label: 'Mon', value: '$124,810.40', height: 38 },
    { label: 'Tue', value: '$125,442.18', height: 48 },
    { label: 'Wed', value: '$124,962.04', height: 42 },
    { label: 'Thu', value: '$126,105.33', height: 59 },
    { label: 'Fri', value: '$126,884.70', height: 68 },
    { label: 'Sat', value: '$127,355.73', height: 76 },
    { label: 'Today', value: '$128,640.25', height: 94 },
  ],
  allocation: [
    { label: 'Equities', value: '$84,512.18', percentage: 65.7, tone: 'gold' },
    { label: 'ETFs', value: '$25,913.07', percentage: 20.1, tone: 'sand' },
    { label: 'Cash', value: '$11,500.00', percentage: 8.9, tone: 'green' },
    {
      label: 'Unsupported / residual',
      value: '$6,715.00',
      percentage: 5.2,
      tone: 'amber',
    },
  ],
  holdings: [
    {
      symbol: 'SYN1',
      name: 'Nova Grid Systems',
      value: '$24,882.40',
      allocation: '19.3%',
      move: '+2.41%',
      direction: 'up',
    },
    {
      symbol: 'SYN2',
      name: 'Atlas Compute',
      value: '$19,765.22',
      allocation: '15.4%',
      move: '+0.82%',
      direction: 'up',
    },
    {
      symbol: 'SYN3',
      name: 'Lumen Health',
      value: '$16,320.10',
      allocation: '12.7%',
      move: '-0.36%',
      direction: 'down',
    },
    {
      symbol: 'SYN4',
      name: 'Orbit Materials',
      value: '$13,405.75',
      allocation: '10.4%',
      move: '+1.17%',
      direction: 'up',
    },
    {
      symbol: 'SYN5',
      name: 'Helio Infrastructure',
      value: '$10,138.71',
      allocation: '7.9%',
      move: '-0.64%',
      direction: 'down',
    },
  ],
};
