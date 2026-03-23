/**
 * Project Canvas Page — loads a specific project's nodes/edges into the canvas
 */

import { SvgCanvas } from '@ice/ui/canvas';
import axiosInstance from '@ui/shared/api/axios-instance';
import { createCard, importToActiveCard, setActiveCard } from '@ui/store/slices/cards-slice';
import { Loader2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '@ui/store';

interface ProjectCanvasProps {
  projectId: string;
  projectName: string;
}

export const ProjectCanvas: React.FC<ProjectCanvasProps> = ({ projectId, projectName }) => {
  const dispatch = useDispatch<AppDispatch>();
  const [loading, setLoading] = useState(true);
  const _activeCardId = useSelector((s: RootState) => s.cards.activeCardId);

  useEffect(() => {
    const loadProject = async () => {
      setLoading(true);
      try {
        // Get the project with its cards
        const res = await axiosInstance.post('/canvas/projects/get', { projectId });
        const project = res.data;
        const cards = project.cards || [];

        if (cards.length > 0) {
          // Load first card's data
          const cardRes = await axiosInstance.post('/canvas/cards/get', { cardId: cards[0].id });
          const card = cardRes.data;

          // Create card in Redux and load its nodes/edges
          dispatch(createCard({ name: card.name, id: card.id, projectId }));
          if (card.nodes?.length > 0 || card.edges?.length > 0) {
            dispatch(setActiveCard(card.id));
            dispatch(
              importToActiveCard({
                nodes: card.nodes || [],
                edges: card.edges || [],
              }),
            );
          } else {
            dispatch(setActiveCard(card.id));
          }
        } else {
          // No cards yet — create one
          const cardRes = await axiosInstance.post('/canvas/cards/create', {
            name: projectName,
            projectId,
          });
          dispatch(createCard({ name: projectName, id: cardRes.data.id, projectId }));
          dispatch(setActiveCard(cardRes.data.id));
        }
      } catch (err) {
        console.error('Failed to load project:', err);
      } finally {
        setLoading(false);
      }
    };

    loadProject();
  }, [projectId, projectName, dispatch]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-ice-base">
        <Loader2 className="w-5 h-5 animate-spin text-ice-text-3" />
      </div>
    );
  }

  return (
    <div className="h-full">
      <SvgCanvas />
    </div>
  );
};
