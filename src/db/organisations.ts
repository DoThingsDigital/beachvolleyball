import { prisma } from "./client";

export type OrganisationSettings = {
  paypalEnabled?: boolean;
  confirmOnProcessing?: boolean;
  termsVersion?: string;
};

export async function getOrganisationSettings(
  organisationId: string,
): Promise<OrganisationSettings> {
  const org = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { settings: true },
  });
  return (org?.settings as OrganisationSettings) ?? {};
}
