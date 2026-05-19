import { searchEngineConceptBlueprint } from './blueprint';
import { searchEngineInfo } from './info';
import { registerInfo } from '../_shared/info-registry';
import { registerConceptFamily } from '../_shared/types';

registerConceptFamily(searchEngineConceptBlueprint.iceType, searchEngineConceptBlueprint.visualFamily);
registerInfo(searchEngineConceptBlueprint.iceType, searchEngineInfo);

export { searchEngineConceptBlueprint, searchEngineInfo };
