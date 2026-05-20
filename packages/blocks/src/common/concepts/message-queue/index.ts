import { messageQueueConceptBlueprint } from './blueprint';
import { messageQueueInfo } from './info';
import { registerInfo } from '../_shared/info-registry';
import { registerConceptFamily } from '../_shared/types';

registerConceptFamily(messageQueueConceptBlueprint.iceType, messageQueueConceptBlueprint.visualFamily);
registerInfo(messageQueueConceptBlueprint.iceType, messageQueueInfo);

export { messageQueueConceptBlueprint, messageQueueInfo };
