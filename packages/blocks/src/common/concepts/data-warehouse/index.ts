import { dataWarehouseConceptBlueprint } from './blueprint';
import { dataWarehouseInfo } from './info';
import { registerInfo } from '../_shared/info-registry';
import { registerConceptFamily } from '../_shared/types';

registerConceptFamily(dataWarehouseConceptBlueprint.iceType, dataWarehouseConceptBlueprint.visualFamily);
registerInfo(dataWarehouseConceptBlueprint.iceType, dataWarehouseInfo);

export { dataWarehouseConceptBlueprint, dataWarehouseInfo };
