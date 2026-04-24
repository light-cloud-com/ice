import { githubRepoConceptBlueprint } from './blueprint';
import { githubRepoInfo } from './info';
import { registerInfo } from '../_shared/info-registry';
import { registerConceptFamily } from '../_shared/types';

registerConceptFamily(githubRepoConceptBlueprint.iceType, githubRepoConceptBlueprint.visualFamily);
registerInfo(githubRepoConceptBlueprint.iceType, githubRepoInfo);

export { githubRepoConceptBlueprint, githubRepoInfo };
