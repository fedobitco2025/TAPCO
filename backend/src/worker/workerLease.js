function createWorkerLease({ LeaseModel, leaseId, ownerId, leaseMs, now = Date.now }) {
  async function acquire() {
    const currentTime = new Date(now());
    const expiresAt = new Date(currentTime.getTime() + leaseMs);
    try {
      const lease = await LeaseModel.findOneAndUpdate(
        {
          _id: leaseId,
          $or: [{ ownerId }, { expiresAt: { $lte: currentTime } }]
        },
        { $set: { ownerId, expiresAt, updatedAt: currentTime } },
        { upsert: true, new: true }
      );
      return lease?.ownerId === ownerId;
    } catch (error) {
      if (error?.code === 11000) return false;
      throw error;
    }
  }

  async function renew() {
    const currentTime = new Date(now());
    const result = await LeaseModel.updateOne(
      { _id: leaseId, ownerId },
      { $set: { expiresAt: new Date(currentTime.getTime() + leaseMs), updatedAt: currentTime } }
    );
    return result.modifiedCount === 1 || result.matchedCount === 1;
  }

  async function release() {
    const result = await LeaseModel.deleteOne({ _id: leaseId, ownerId });
    return result.deletedCount === 1;
  }

  return { acquire, renew, release };
}

module.exports = { createWorkerLease };