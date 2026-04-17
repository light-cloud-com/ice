import { registerConceptFamily } from '../_shared/types';
import { registerInfo } from '../_shared/info-registry';
import { apiGatewayConceptBlueprint } from './blueprint';
import { apiGatewayInfo } from './info';

registerConceptFamily(apiGatewayConceptBlueprint.iceType, apiGatewayConceptBlueprint.visualFamily);
registerInfo(apiGatewayConceptBlueprint.iceType, apiGatewayInfo);

export { apiGatewayConceptBlueprint, apiGatewayInfo };
