import { registerConceptFamily } from '../_shared/types';
import { registerInfo } from '../_shared/info-registry';
import { githubRepoConceptBlueprint } from './blueprint';
import { githubRepoInfo } from './info';

registerConceptFamily(githubRepoConceptBlueprint.iceType, githubRepoConceptBlueprint.visualFamily);
registerInfo(githubRepoConceptBlueprint.iceType, githubRepoInfo);

export { githubRepoConceptBlueprint, githubRepoInfo };
