import React from "react";
import { useTranslation } from "react-i18next";
import { useSelectedOrganizationId } from "#/context/use-selected-organization";
import { useOrganizations } from "#/hooks/query/use-organizations";
import { I18nKey } from "#/i18n/declaration";
import { Dropdown } from "#/ui/dropdown/dropdown";

export function OrgSelector() {
  const { t } = useTranslation();
  const { orgId, setOrgId } = useSelectedOrganizationId();
  const { data: organizations, isLoading } = useOrganizations();

  // Auto-select the first organization when data loads and no org is selected
  React.useEffect(() => {
    if (!orgId && organizations && organizations.length > 0) {
      setOrgId(organizations[0].id);
    }
  }, [orgId, organizations, setOrgId]);

  const selectedOrg = React.useMemo(() => {
    if (orgId) {
      return organizations?.find((org) => org.id === orgId);
    }

    return organizations?.[0];
  }, [orgId, organizations]);

  return (
    <Dropdown
      testId="org-selector"
      key={selectedOrg?.id}
      defaultValue={{
        label: selectedOrg?.name || "",
        value: selectedOrg?.id || "",
      }}
      onChange={(item) => {
        setOrgId(item ? item.value : null);
      }}
      placeholder={t(I18nKey.ORG$SELECT_ORGANIZATION_PLACEHOLDER)}
      loading={isLoading}
      options={
        organizations?.map((org) => ({
          value: org.id,
          label: org.name,
        })) || []
      }
    />
  );
}
