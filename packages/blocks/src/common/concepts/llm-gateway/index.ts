import { llmGatewayConceptBlueprint } from './blueprint';
import { llmGatewayInfo } from './info';
import { registerInfo } from '../_shared/info-registry';
import { registerConceptFamily } from '../_shared/types';

registerConceptFamily(llmGatewayConceptBlueprint.iceType, llmGatewayConceptBlueprint.visualFamily);
registerInfo(llmGatewayConceptBlueprint.iceType, llmGatewayInfo);

export { llmGatewayConceptBlueprint, llmGatewayInfo };
