import { UnionFromKeys } from './utils';

export const ComparisonTypes = {
  BOOLEAN: 'boolean',
  DATE: 'date',
  // MEDICAREELIGIBILITY: 'medicareEligibility',
  STRING: 'string',
} as const;
export type ComparisonType = UnionFromKeys<typeof ComparisonTypes>;

export const ComparisonOperators = {
  EQUALS: 'equals',
  NOTEQUALS: 'notEquals',
  GREATERTHAN: 'greaterThan',
  GREATERTHANOREQUAL: 'greaterThanOrEqual',
  LESSERTHAN: 'lesserThan',
  LESSERTHANOREQUAL: 'lesserThanOrEqual',
  HASVALUE: 'hasValue',
  // CONTAINS: 'contains',
} as const;
type ComparisonOperator = UnionFromKeys<typeof ComparisonOperators>;

export const DateComparisonTypes = {
  EXACT: 'exact',
  MONTHOFFSET: 'monthOffset',
  MONTHOFFSETRANGE: 'monthOffsetRange',
  DATEDIFFERENCE: 'dateDifference',
  DATERANGE: 'dateRange',
  MULTIPLEDATEMONTHOFFSETRANGE: 'multipleDateMonthOffsetRange',
} as const;
type DateComparisonType = UnionFromKeys<typeof DateComparisonTypes>;

interface ComparisonBase<Type extends ComparisonType> {
  comparisonType: Type;
}

interface BooleanComparison extends ComparisonBase<'boolean'> {
  comparisonOperator: ComparisonOperator;
  comparisonValue: boolean;
}

interface StringComparison extends ComparisonBase<'string'> {
  comparisonOperator: ComparisonOperator;
  comparisonValue: string;
}

interface DateComparisonBase<Type extends DateComparisonType>
  extends ComparisonBase<'date'> {
  dateComparisonType: Type;
}

interface ExactDateComparison extends DateComparisonBase<'exact'> {
  comparisonOperator: ComparisonOperator;
  comparisonValue: string;
}

export type Comparison =
  | BooleanComparison
  | StringComparison
  | ExactDateComparison;
