export function formatJoinLink(link: string): string {
  const channelsMatch = link.match(
    /^https?:\/\/[^/]+\/api\/chat\/channels\/([^/]+)\/([^/]+)\/?$/
  );

  if (channelsMatch) {
    const [, action, id] = channelsMatch;
    return `http://channels/${action}/${id}/`;
  }

  const joinMatch = link.match(/^https?:\/\/join\/([^/]+)\/?$/);

  if (joinMatch) {
    const [, id] = joinMatch;
    return `http://groups/join/${id}`;
  }

  return link;
}
