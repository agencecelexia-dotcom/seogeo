import { WorkbenchActionService } from "./WorkbenchActionService";
import { BacklinkProspectService } from "./BacklinkProspectService";
export const WorkbenchService = {
  ...WorkbenchActionService,
  ...BacklinkProspectService,
};
