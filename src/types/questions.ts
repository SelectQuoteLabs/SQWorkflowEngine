import { UnionFromKeys } from './utils';

export const QuestionTypes = {
  TEXT: 'text',
  BOOLEAN: 'boolean',
  DATE: 'date',
  NUMBER: 'number',
  MULTIPLECHOICE: 'multipleChoice',
} as const;
export type QuestionType = UnionFromKeys<typeof QuestionTypes>;

export const DisplayTypes = {
  DROPDOWN: 'dropDown',
  RADIOBUTTONLIST: 'radioButtonList',
  CHECKBOXLIST: 'checkboxList',
} as const;
type DisplayType = UnionFromKeys<typeof DisplayTypes>;

export const ResponseSourceTypes = {
  AGENT: 1,
  API: 2,
  TENEO: 3,
} as const;

export const ResponseDataTypes = {
  BOOLEAN: 1,
  DATE: 2,
  STRING: 3,
} as const;

export type ResponseSourceType = UnionFromKeys<typeof ResponseSourceTypes>;
export type ResponseDataType = UnionFromKeys<typeof ResponseDataTypes>;

export interface PrePopulatedResponse {
  responseType: 'string' | 'date' | 'boolean';
  value: string | boolean;
  id: string | null;
  responseSourceType: ResponseSourceType;
  responseDate: string;
}
export const InputMaskTypes = {
  NONE: 'none',
  PHONE: 'phone',
  EMAIL: 'email',
  ZIP_CODE: 'zipCode',
  SOCIAL_SECURITY_NUMBER: 'socialSecurityNumber',
  PERCENT: 'percent',
  NUMBER: 'number',
  CURRENCY: 'currency',
} as const;
type InputMaskType = UnionFromKeys<typeof InputMaskTypes>;

type TextInputMaskType = Extract<
  'none' | 'phone' | 'email' | 'zipCode' | 'socialSecurityNumber' | 'percent',
  InputMaskType
>;
type NumberInputMaskType = Extract<'currency' | 'number', InputMaskType>;

interface QuestionBase<Type extends QuestionType> {
  questionType: Type;
  id: string;
  labelText: string;
  metaDataTag: string;
  prePopulatedResponse?: PrePopulatedResponse;
}

interface TextQuestion extends QuestionBase<'text'> {
  maxLength: number;
  allowMultipleLines: boolean;
  inputMaskType: TextInputMaskType;
}

interface NumberQuestion extends QuestionBase<'number'> {
  minValue: number;
  maxValue: number;
  defaultValue: number;
  inputMaskType: NumberInputMaskType;
}

export interface BooleanQuestion extends QuestionBase<'boolean'> {
  displayType: Exclude<DisplayType, 'checkBoxList'>;
}

interface MultipleChoiceQuestion extends QuestionBase<'multipleChoice'> {
  displayType: DisplayType;
  allowMultipleSelection: boolean;
  values: MultipleChoiceOptionValue[];
  dataSource: DataSource | null;
}

interface MultipleChoiceOptionValue {
  value: string;
  label: string;
}

interface DateQuestion extends QuestionBase<'date'> {
  dateFormat: string;
}

export type Question =
  | TextQuestion
  | NumberQuestion
  | BooleanQuestion
  | MultipleChoiceQuestion
  | DateQuestion;

export interface DataSource {
  dataSourceType: 'api';
  url: string;
  requestMethodType: 'get';
  queryStringParameters: {
    parameterType: 'question';
    questionId: string;
    parameterName: string;
  }[];
  labelPropertyName: string;
  valuePropertyName: string;
}
