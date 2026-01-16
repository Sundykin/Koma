/**
 * 服务层索引
 */
import { projectService, ProjectService } from './project';

export const services = {
  project: projectService,
};

export { ProjectService, projectService };
export default services;
