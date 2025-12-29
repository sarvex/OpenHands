import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { IntegrationService } from "#/api/integration-service/integration-service.api";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";
import { I18nKey } from "#/i18n/declaration";

export const useReinstallGitLabWebhook = () => {
  const { t } = useTranslation();

  return useMutation({
    mutationFn: () => IntegrationService.reinstallGitLabWebhook(),
    onSuccess: () => {
      displaySuccessToast(t(I18nKey.SETTINGS$GITLAB_INSTALLING_WEBHOOK));
    },
    onError: (error) => {
      const errorMessage = retrieveAxiosErrorMessage(error);
      displayErrorToast(errorMessage || t(I18nKey.ERROR$GENERIC));
    },
  });
};
