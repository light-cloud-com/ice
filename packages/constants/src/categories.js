/**
 * View Level Visibility Rules
 */
import { Cat, ICE } from './ice-types.js';
export const LEVEL_VISIBLE_CATEGORIES = {
    1: [Cat.Compute, Cat.Data],
    2: [Cat.Compute, Cat.Data, Cat.Network],
    3: [Cat.Compute, Cat.Data, Cat.Network, Cat.Security, Cat.Observability],
};
export const NETWORK_CONTAINER_TYPES = [ICE.Network.VPC, ICE.Network.Subnet, ICE.Network.PrivateNetwork];
export const L1_VISIBLE_NETWORK_TYPES = [
    ICE.Network.PublicEndpoint,
    ICE.Network.CustomDomain,
    ICE.Network.PrivateNetwork,
    ICE.Network.Gateway,
];
