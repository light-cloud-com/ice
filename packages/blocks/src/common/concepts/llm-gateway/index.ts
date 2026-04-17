import { registerConceptFamily } from '../_shared/types';
import { registerInfo } from '../_shared/info-registry';
import { llmGatewayConceptBlueprint } from './blueprint';
import { llmGatewayInfo } from './info';

registerConceptFamily(llmGatewayConceptBlueprint.iceType, llmGatewayConceptBlueprint.visualFamily);
registerInfo(llmGatewayConceptBlueprint.iceType, llmGatewayInfo);

export { llmGatewayConceptBlueprint, llmGatewayInfo };
