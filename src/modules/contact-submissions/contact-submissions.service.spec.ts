import { ContactSubmissionStatus } from '@prisma/client';
import { UserRoleEnum } from '../../common/enums';
import { ContactSubmissionsService } from './contact-submissions.service';

describe('ContactSubmissionsService', () => {
  const makeService = () => {
    const contactSubmissionsRepository = {
      create: jest.fn(),
      list: jest.fn(),
      findById: jest.fn(),
      updateStatus: jest.fn(),
      markReplied: jest.fn(),
    };
    const mailerService = {
      sendEmail: jest.fn(),
    };
    const service = new ContactSubmissionsService(
      contactSubmissionsRepository as never,
      mailerService as never,
    );

    return { service, contactSubmissionsRepository, mailerService };
  };

  it('stores public contact submissions as new', async () => {
    const { service, contactSubmissionsRepository } = makeService();
    contactSubmissionsRepository.create.mockResolvedValue({
      id: 'contact-1',
      status: ContactSubmissionStatus.NEW,
    });

    await service.createPublicSubmission({
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: null,
      name: 'Jane',
      email: 'jane@example.com',
      subject: 'Question',
      message: 'Hello',
    });

    expect(contactSubmissionsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
        status: ContactSubmissionStatus.NEW,
      }),
    );
  });

  it('scopes business admin list to tenant submissions', async () => {
    const { service, contactSubmissionsRepository } = makeService();
    contactSubmissionsRepository.list.mockResolvedValue({
      items: [],
      total: 0,
    });

    await service.list(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
        restaurantId: 'restaurant-1',
      },
    );

    expect(contactSubmissionsRepository.list).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
      }),
      expect.anything(),
    );
  });

  it('scopes branch admin list to own branch', async () => {
    const { service, contactSubmissionsRepository } = makeService();
    contactSubmissionsRepository.list.mockResolvedValue({
      items: [],
      total: 0,
    });

    await service.list(
      {
        uid: 'branch-admin-1',
        rid: 'restaurant-1',
        bid: 'branch-1',
        role: UserRoleEnum.BRANCH_ADMIN,
      },
      {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
        branchId: 'other-branch',
      },
    );

    expect(contactSubmissionsRepository.list).toHaveBeenCalledWith(
      expect.objectContaining({
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
      }),
      expect.anything(),
    );
  });

  it('sends reply email and marks submission replied', async () => {
    const { service, contactSubmissionsRepository, mailerService } =
      makeService();
    contactSubmissionsRepository.findById.mockResolvedValue({
      id: 'contact-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      name: 'Jane',
      email: 'jane@example.com',
      subject: 'Delivery question',
      message: 'When will it arrive?',
    });
    contactSubmissionsRepository.markReplied.mockResolvedValue({
      id: 'contact-1',
      status: ContactSubmissionStatus.REPLIED,
    });

    const result = await service.reply(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      'contact-1',
      {
        message: 'We will contact you shortly.',
      },
    );

    expect(mailerService.sendEmail).toHaveBeenCalledWith(
      'jane@example.com',
      'Re: Delivery question',
      expect.stringContaining('We will contact you shortly.'),
    );
    expect(contactSubmissionsRepository.markReplied).toHaveBeenCalledWith(
      'contact-1',
      expect.objectContaining({
        replySubject: 'Re: Delivery question',
        replyMessage: 'We will contact you shortly.',
        repliedById: 'admin-1',
      }),
    );
    expect(result.data.status).toBe(ContactSubmissionStatus.REPLIED);
  });
});
