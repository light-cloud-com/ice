import { registerConceptFamily } from '../_shared/types';
import { registerInfo } from '../_shared/info-registry';
import { messageQueueConceptBlueprint } from './blueprint';
import { messageQueueInfo } from './info';

registerConceptFamily(messageQueueConceptBlueprint.iceType, messageQueueConceptBlueprint.visualFamily);
registerInfo(messageQueueConceptBlueprint.iceType, messageQueueInfo);

export { messageQueueConceptBlueprint, messageQueueInfo };
