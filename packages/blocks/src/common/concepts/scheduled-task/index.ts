import { registerConceptFamily } from '../_shared/types';
import { registerInfo } from '../_shared/info-registry';
import { scheduledTaskConceptBlueprint } from './blueprint';
import { scheduledTaskInfo } from './info';

registerConceptFamily(scheduledTaskConceptBlueprint.iceType, scheduledTaskConceptBlueprint.visualFamily);
registerInfo(scheduledTaskConceptBlueprint.iceType, scheduledTaskInfo);

export { scheduledTaskConceptBlueprint, scheduledTaskInfo };
