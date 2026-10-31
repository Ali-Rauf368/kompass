export type Role = "ADMIN" | "HR" | "SALES" | "AFTERSALES" | "ACCOUNTING" | "MANAGER" | "EMPLOYEE";

export interface SessionUser {
  id: number;
  username: string;
  displayName: string;
  roles: Role[];
  employeeId: number | null;
}

export interface Ref {
  id: number;
  code: string;
  name: string;
}

export interface Employee {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  jobTitle: string;
  status: "ACTIVE" | "ON_LEAVE" | "LEFT";
  company: Ref;
  department: Ref;
  manager: { id: number; firstName: string; lastName: string } | null;
  personnelNo?: string;
  username?: string;
  hireDate?: string;
  exitDate?: string | null;
  vacationDays?: number;
  pseudonymizedAt?: string | null;
}

export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
export interface LeaveRequest {
  id: number;
  type: "VACATION" | "SICK" | "TRAINING" | "OTHER";
  startDate: string;
  endDate: string;
  workingDays: number;
  status: LeaveStatus;
  note: string | null;
  decidedAt: string | null;
  employee: { id: number; firstName: string; lastName: string; username: string; department: { name: string } };
  approver: { id: number; firstName: string; lastName: string } | null;
}

export interface Customer {
  id: number;
  number: string;
  name: string;
  segment: "PRIVATE" | "BUSINESS" | "PUBLIC_SECTOR";
  email: string | null;
  phone: string | null;
  street: string | null;
  postalCode: string;
  city: string;
  source: string;
  _count?: { deals: number; tickets: number; invoices: number };
}

export type DealStage = "LEAD" | "QUALIFIED" | "PROPOSAL" | "NEGOTIATION" | "WON" | "LOST";
export interface Deal {
  id: number;
  title: string;
  stage: DealStage;
  valueCents: number;
  probability: number;
  expectedClose: string;
  closedAt: string | null;
  lostReason: string | null;
  customer: { id: number; number: string; name: string; city: string };
  owner: { id: number; firstName: string; lastName: string };
  company: Ref;
}

export type TicketStatus = "OPEN" | "IN_PROGRESS" | "WAITING" | "RESOLVED" | "CLOSED";
export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export interface Ticket {
  id: number;
  number: string;
  subject: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  channel: "PHONE" | "EMAIL" | "PORTAL" | "TECHNICIAN";
  slaDueAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  customer: { id: number; number: string; name: string; city: string; phone: string | null };
  assignee: { id: number; firstName: string; lastName: string; username: string } | null;
  company: Ref;
}

export interface TicketActivity {
  _id: string;
  kind: "comment" | "status" | "assignment" | "created";
  author: string;
  authorName: string;
  body?: string;
  from?: string;
  to?: string;
  internal?: boolean;
  at: string;
}

export interface Invoice {
  id: number;
  number: string;
  status: "DRAFT" | "OPEN" | "PAID" | "CANCELLED";
  amountCents: number;
  issueDate: string;
  dueDate: string;
  paidAt: string | null;
  source: string;
  customer: { id: number; number: string; name: string };
  company: Ref;
}

export interface Notification {
  id: string;
  kind: string;
  title: string;
  body?: string;
  link?: string;
  readAt: string | null;
  createdAt: string;
}
