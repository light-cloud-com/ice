import { logTerminalConceptBlueprint } from './blueprint';
import { logTerminalInfo } from './info';
import { registerInfo } from '../_shared/info-registry';
import { registerConceptFamily } from '../_shared/types';

registerConceptFamily(logTerminalConceptBlueprint.iceType, logTerminalConceptBlueprint.visualFamily);
registerInfo(logTerminalConceptBlueprint.iceType, logTerminalInfo);

export { logTerminalConceptBlueprint, logTerminalInfo };
