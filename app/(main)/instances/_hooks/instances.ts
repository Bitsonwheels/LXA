import {
  useInstancesResource,
  type UseInstancesRequest,
} from '@/app/_incus/resources/instances/hooks';

export function useInstances(request?: string | null | UseInstancesRequest) {
  return useInstancesResource(
    request && typeof request === 'object' ? request : { project: request },
  );
}
