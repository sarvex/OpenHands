export type OrganizationUserRole = "user" | "admin" | "owner";

export interface Organization {
  id: string;
  name: string;
  balance: number;
  is_personal?: boolean;
}

export interface OrganizationMember {
  id: string;
  email: string;
  role: OrganizationUserRole;
  status: "active" | "invited";
}
