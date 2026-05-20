import { scheduledTaskConceptBlueprint } from './blueprint';
import { scheduledTaskInfo } from './info';
import { registerInfo } from '../_shared/info-registry';
import { registerConceptFamily } from '../_shared/types';

registerConceptFamily(scheduledTaskConceptBlueprint.iceType, scheduledTaskConceptBlueprint.visualFamily);
registerInfo(scheduledTaskConceptBlueprint.iceType, scheduledTaskInfo);

export { scheduledTaskConceptBlueprint, scheduledTaskInfo };
