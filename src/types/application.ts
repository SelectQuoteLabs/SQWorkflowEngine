export interface Application {
  applicationKey: string;
  workflowId: string;
  accountId: number;
  individualId: number;
  contractId: string;
  planBenefitPackageId: string;
  segmentId: string;
  carrierName: string;
  planName: string;
  monthlyPremium: number;
  effectiveYear: number;
  agentUserKey: string;
  agentWritingNumber: string;
  applicantFirstName: string;
  applicantLastName: string;
  agentFirstName: string;
  agentLastName: string;
  agentEmail: string;
  startTimestamp: string;
  submittedTimestamp: string;
  confirmationId: string;
}
