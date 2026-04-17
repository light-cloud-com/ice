import { registerConceptFamily } from '../_shared/types';
import { registerInfo } from '../_shared/info-registry';
import { eventStreamConceptBlueprint } from './blueprint';
import { eventStreamInfo } from './info';

registerConceptFamily(eventStreamConceptBlueprint.iceType, eventStreamConceptBlueprint.visualFamily);
registerInfo(eventStreamConceptBlueprint.iceType, eventStreamInfo);

export { eventStreamConceptBlueprint, eventStreamInfo };
