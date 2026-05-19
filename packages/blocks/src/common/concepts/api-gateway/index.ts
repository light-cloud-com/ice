import { apiGatewayConceptBlueprint } from './blueprint';
import { apiGatewayInfo } from './info';
import { registerInfo } from '../_shared/info-registry';
import { registerConceptFamily } from '../_shared/types';

registerConceptFamily(apiGatewayConceptBlueprint.iceType, apiGatewayConceptBlueprint.visualFamily);
registerInfo(apiGatewayConceptBlueprint.iceType, apiGatewayInfo);

export { apiGatewayConceptBlueprint, apiGatewayInfo };
