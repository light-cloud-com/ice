import { eventStreamConceptBlueprint } from './blueprint';
import { eventStreamInfo } from './info';
import { registerInfo } from '../_shared/info-registry';
import { registerConceptFamily } from '../_shared/types';

registerConceptFamily(eventStreamConceptBlueprint.iceType, eventStreamConceptBlueprint.visualFamily);
registerInfo(eventStreamConceptBlueprint.iceType, eventStreamInfo);

export { eventStreamConceptBlueprint, eventStreamInfo };
