import { openHands } from "../open-hands-axios";
import { ReinstallGitLabWebhookResponse } from "./integration-service.types";

export class IntegrationService {
  static async reinstallGitLabWebhook(): Promise<ReinstallGitLabWebhookResponse> {
    const { data } = await openHands.post<ReinstallGitLabWebhookResponse>(
      "/integration/gitlab/reinstall-webhook",
    );
    return data;
  }
}
