import { registerConceptFamily } from '../_shared/types';
import { registerInfo } from '../_shared/info-registry';
import { logTerminalConceptBlueprint } from './blueprint';
import { logTerminalInfo } from './info';

registerConceptFamily(logTerminalConceptBlueprint.iceType, logTerminalConceptBlueprint.visualFamily);
registerInfo(logTerminalConceptBlueprint.iceType, logTerminalInfo);

export { logTerminalConceptBlueprint, logTerminalInfo };
